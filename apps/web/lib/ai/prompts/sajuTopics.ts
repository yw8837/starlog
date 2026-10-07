import "server-only";
import { BRANCHES, HIDDEN_STEMS, computeChart, ganzhiKo, mainHiddenStem, type SajuChart } from "@starlog/core";
import { hasFinalConsonant } from "@/lib/korean";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { situationOf } from "@/lib/sajuTopics";
import type { HistoryItem } from "@/lib/ai/history";
import {
  PLACE_LABEL, annualToLuck, buildFactSet, glyphDisplay, layerToNatal, luckStarts, natalPillars, relationsTo, tenGod, yearGanzhi,
  type MonthPillar, type Placed, type PlacedPillar, type Relation, type SajuFactSet,
} from "@/lib/ai/prompts/saju";

/**
 * 주제별 사주 facts (saju-topics spec §6.3, §7.4): everything `buildFactSet` gives 전체 흐름, plus what a
 * topic reads: the five ten-god groups, the coming year's 세운, a 대운 edge the unknown birth time
 * blurs, the day-pillar window (연애운·재회운), the topic's own limit line, the facts each section
 * starts from (`focus`) and, for the validator only, the year-months and section anchors. All of it is
 * deterministic: the same chart and the same day give the same facts.
 */

type Branch = (typeof BRANCHES)[number];
const KEYS = ["year", "month", "day", "hour"] as const;
const KST = 9 * 3_600_000;
const DAY_MS = 86_400_000;

export const GROUP_NAMES = ["비겁", "식상", "재성", "관성", "인성"] as const;
export type GroupName = (typeof GROUP_NAMES)[number];
const GROUP_GODS: Readonly<Record<GroupName, readonly [string, string]>> = {
  비겁: ["비견", "겁재"],
  식상: ["식신", "상관"],
  재성: ["편재", "정재"],
  관성: ["편관", "정관"],
  인성: ["편인", "정인"],
};

/** The group a ten god belongs to. */
export const groupOf = (god: string): GroupName => GROUP_NAMES.find((name) => GROUP_GODS[name].includes(god))!;

export interface GroupFact {
  name: GroupName;
  /** stems (never the day stem) and branch 본기 holding it: "년간 己 상관", "월지 子 정관" */
  visible: string[];
  /** 지장간 중기·여기 holding it: "년지 巳 속 중기 庚 편재" */
  hidden: string[];
  /** how many visible places hold it */
  count: number;
  /** it shows on a stem (천간에 드러남) */
  onStem: boolean;
  /** a branch holds it, as 본기 or inside (뿌리) */
  rooted: boolean;
}

export interface NextAnnual {
  year: number;
  gz: string;
  ko: string;
  stemTenGod: string;
  branchMainTenGod: string;
  relationsToNatal: Relation[];
  /** the 대운 in force at that year's 입춘 and how its branch meets the 세운 branch */
  luck: { gz: string; ko: string; relations: Relation[] } | null;
  starts: "입춘 무렵";
}

export interface DayWindow {
  /** the engine's DAY_PILLAR_WINDOW sentence */
  sentence: string;
  /** "00:00~00:32" */
  range: string;
  /** that window's 일지, display form: "축토(丑土)" */
  dayBranch: string;
}

export interface TopicAnchors {
  /** 2절 must name one of these */
  s2: string[];
  /** 3절 must name one of these */
  s3: string[];
  /** 4절 must name one of these (the current 대운, or what stands for it) */
  s4: string[];
  /** 5절 must name one of each: this year's 세운, then the coming year's */
  s5: [string[], string[]];
  /** groups 2절 and 3절 lean on whose visible count is 0: the section names them with 없음 or 숨음 */
  zeroS2: GroupName[];
  zeroS3: GroupName[];
  /** the next 대운 when it starts within a year (luck.changeSoon): 4절 names it */
  nextLuck: string[] | null;
}

/** A 월건 as topic facts carry it: the 절 by name only, since its date is what the timing checks reject. */
export type TopicMonth = Omit<MonthPillar, "term"> & { term: { name: string } | null };

export interface SajuTopicFactSet extends Omit<SajuFactSet, "schemaVersion" | "allowed" | "profile" | "monthly"> {
  schemaVersion: "saju-topic-facts/1";
  topic: SajuTopicId;
  monthly?: { current: TopicMonth; next: TopicMonth };
  groups: { basis: string; items: GroupFact[] };
  nextAnnual: NextAnnual;
  /** set when the 대운 changes about now and the unknown birth time moves that change by months */
  luckEdge: string | null;
  /** 연애운·재회운 only: the unknown time may move the day pillar */
  dayWindow: DayWindow | null;
  /** the facts each topic section starts from (s2–s5 are sections 2–5) */
  focus: { s2: string[]; s3: string[]; s4: string[]; s5: string[] };
  /** what the validator allows and expects (never sent to the model) */
  allowed: SajuFactSet["allowed"] & { yearMonths: string[]; anchors: TopicAnchors };
  /** the situation chip (sent inside <user_context>, never <facts>) */
  situation?: { id: SajuSituationId; label: string };
  /** until when a teaser written now stays current (ISO); never sent to the model */
  freshUntil: string;
}

/** The topic's own limit line (spec §6.3 `limits`). */
export const TOPIC_LIMIT: Readonly<Record<SajuTopicId, string>> = {
  love: "상대의 명식 없이 내 명식만 읽었어요.",
  reunion: "상대의 명식 없이 내 명식만 읽었어요.",
  money: "금액·수익·투자 판단은 이 풀이로 보지 않아요.",
  career: "합격·승진·이직의 때는 이 풀이로 보지 않아요.",
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymOf = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
const monthIndex = (ym: string) => {
  const [y = 0, m = 0] = ym.split("-").map(Number);
  return y * 12 + m - 1;
};

/** "기묘(己卯)로", "경진(庚辰)으로": 로/으로 by the Hangul before the brackets (ㄹ takes 로). */
function toward(word: string): string {
  const bare = word.replace(/\([^)]*\)$/, "");
  const last = bare.charCodeAt(bare.length - 1) - 0xac00;
  return `${word}${hasFinalConsonant(bare) && last % 28 !== 8 ? "으로" : "로"}`;
}

const relationLine = (r: Relation) => `${r.members.join("와 ")} 사이에 ${r.type} 관계가 있어요`;

/** The next 입춘 after `now` (the 寅월 of a 2월 20일 probe opens at 입춘). */
export function nextIpchun(now: number): number {
  const year = new Date(now + KST).getUTCFullYear();
  for (const y of [year, year + 1]) {
    const probe = computeChart({ calendar: "solar", year: y, month: 2, day: 20, time: { hour: 12, minute: 0 }, gender: "female", place: { name: "서울", longitude: 126.978 } });
    const at = probe.monthStartTerm ? Date.parse(probe.monthStartTerm.instantUTC) : Number.NaN;
    if (at > now) return at;
  }
  return now + 365 * DAY_MS;
}

/** A teaser written now stays current for 30 days, until the next 입춘 or until the current 대운 ends, whichever is first (spec §9.3). */
export function teaserFreshUntil(facts: Pick<SajuFactSet, "luck">, now: number): string {
  const ends = [now + 30 * DAY_MS, nextIpchun(now)];
  const to = facts.luck?.current?.to;
  if (to) {
    const [y = 0, m = 1] = to.split("-").map(Number);
    ends.push(Date.UTC(y, m - 1, 1) - KST);
  }
  return new Date(Math.min(...ends)).toISOString();
}

export function buildTopicFactSet(
  chart: SajuChart, now: number, topic: SajuTopicId, situation?: SajuSituationId, history?: readonly HistoryItem[],
): SajuTopicFactSet {
  const base = buildFactSet(chart, now, undefined, history);
  const day = chart.pillars.day.stem;
  const keys = KEYS.filter((k) => chart.pillars[k]);
  const timeKnown = chart.pillars.hour !== null;
  const natal = natalPillars(chart);

  // ---- the five groups ----
  const items = GROUP_NAMES.map((name): GroupFact => {
    const visible: string[] = [];
    const hidden: string[] = [];
    let onStem = false;
    let rooted = false;
    for (const k of keys) {
      const p = chart.pillars[k]!;
      const stemGod = tenGod(day, p.stem);
      if (k !== "day" && groupOf(stemGod) === name) {
        visible.push(`${PLACE_LABEL[k]}간 ${p.stem} ${stemGod}`);
        onStem = true;
      }
      const mainGod = tenGod(day, mainHiddenStem(p.branch));
      if (groupOf(mainGod) === name) {
        visible.push(`${PLACE_LABEL[k]}지 ${p.branch} ${mainGod}`);
        rooted = true;
      }
      p.hidden.filter((h) => h.role !== "본기").forEach((h) => {
        const god = tenGod(day, h.stem);
        if (groupOf(god) !== name) return;
        hidden.push(`${PLACE_LABEL[k]}지 ${p.branch} 속 ${h.role} ${h.stem} ${god}`);
        rooted = true;
      });
    }
    return { name, visible, hidden, count: visible.length, onStem, rooted };
  });
  const group = Object.fromEntries(items.map((item) => [item.name, item])) as Record<GroupName, GroupFact>;
  const basis = timeKnown ? "천간과 지지 본기 기준(일간 제외)" : "시주 없이 여섯 글자 기준(일간 제외)";
  const most = Math.max(...items.map((item) => item.count));
  const mostGroups = items.filter((item) => item.count === most).map((item) => item.name);

  // ---- the coming year's 세운 ----
  const year = base.annual.year + 1;
  const gz = yearGanzhi(year);
  const ns: Placed = { glyph: gz.charAt(0), at: "다가오는 해 세운 천간" };
  const nb: Placed = { glyph: gz.charAt(1), at: "다가오는 해 세운 지지" };
  const nextPlaced: PlacedPillar = { at: "다가오는 해 세운", stem: ns, branch: nb };
  const ipchun = `${year}-02`;
  const luckThen = base.luck?.cycles.find((c) => c.from !== null && c.to !== null && c.from <= ipchun && ipchun < c.to) ?? null;
  const luckThenPlaced: PlacedPillar | null = luckThen
    ? { at: "대운", stem: { glyph: luckThen.gz.charAt(0), at: "대운 천간" }, branch: { glyph: luckThen.gz.charAt(1), at: "대운 지지" } }
    : null;
  const nextAnnual: NextAnnual = {
    year,
    gz,
    ko: ganzhiKo(gz),
    stemTenGod: tenGod(day, ns.glyph),
    branchMainTenGod: tenGod(day, mainHiddenStem(nb.glyph)),
    relationsToNatal: layerToNatal(nextPlaced, natal),
    luck: luckThen && luckThenPlaced ? { gz: luckThen.gz, ko: luckThen.ko, relations: annualToLuck(nextPlaced, luckThenPlaced, natal) } : null,
    starts: "입춘 무렵",
  };

  // ---- a 대운 edge the unknown time blurs ----
  const starts = chart.luck.forward === null || chart.luck.pillars.length === 0 ? null : luckStarts(chart);
  const spread = starts ? Math.round((starts.latest.getTime() - starts.earliest.getTime()) / (30.44 * DAY_MS) / 2) : 0;
  const nowYm = ymOf(new Date(now + KST));
  let luckEdge: string | null = null;
  const cycles = base.luck?.cycles ?? [];
  if (spread > 0) {
    for (let i = 1; i < cycles.length; i++) {
      const from = cycles[i]!.from;
      if (!from || Math.abs(monthIndex(from) - monthIndex(nowYm)) > spread) continue;
      const before = cycles[i - 1]!;
      const after = cycles[i]!;
      luckEdge = `지금은 대운이 ${before.ko}(${before.gz})에서 ${toward(`${after.ko}(${after.gz})`)} 바뀌는 무렵이에요. 태어난 시각을 몰라 바뀌는 때가 앞뒤 약 ${spread}개월 달라질 수 있어요.`;
      break;
    }
  }

  // ---- the day-pillar window (연애운·재회운) ----
  const warning = chart.warnings.find((w) => w.code === "DAY_PILLAR_WINDOW" && w.window);
  const dayWindow: DayWindow | null = (topic === "love" || topic === "reunion") && warning?.window
    ? { sentence: warning.message, range: `${warning.window.from}~${warning.window.to}`, dayBranch: glyphDisplay(warning.window.dayPillar.charAt(1)) }
    : null;

  // ---- focus: the facts each section starts from ----
  const groupLine = (g: GroupFact) =>
    `${g.name}: 겉 ${g.count}개${g.visible.length ? `(${g.visible.join(", ")})` : ""}, 지장간 ${g.hidden.length ? g.hidden.join(", ") : "없음"}, 천간에 ${g.onStem ? "드러남" : "드러나지 않음"}, 지지에 뿌리 ${g.rooted ? "있음" : "없음"}`;
  const pairLine = (a: GroupName, b: GroupName) => {
    const [x, y] = [group[a].count > 0, group[b].count > 0];
    if (x && y) return `${a}과 ${b}이 겉에 함께 있어요`;
    if (x) return `${a}은 겉에 있고 ${b}은 겉에 없어요`;
    if (y) return `${b}은 겉에 있고 ${a}은 겉에 없어요`;
    return `${a}과 ${b} 모두 겉에 없어요`;
  };
  const hiddenLine = (g: GroupFact) =>
    g.count > 0 ? "" : g.hidden.length ? `${g.name}은 겉에 없고 지장간에 숨어 있어요: ${g.hidden.join(", ")}` : `${g.name}은 지장간에도 없어요`;
  const pillarOf = (label: "년" | "월" | "일" | "시") => base.pillars.find((p) => p.pillar.includes(`(${label}주)`));
  const dayPillar = pillarOf("일")!;
  const monthPillar = pillarOf("월")!;
  const dayBranchLine = `일지 ${dayPillar.branch.display}: 본기 ${dayPillar.branch.mainTenGod}, 지장간 ${dayPillar.hidden.map((h) => `${h.glyph} ${h.role} ${h.tenGod}`).join(", ")}, 12운성 ${dayPillar.branch.twelveStage}`;
  // a 삼합·방합 names a twice-standing glyph once with both places: "子(년지·일지)"
  const touchesDay = (r: Relation) => r.members.some((m) => /[(·]일[지간][·)]/.test(m));
  const dayRelations = base.relations.filter(touchesDay).map(relationLine);
  const current = base.luck?.current ?? null;
  const luckLine = current
    ? `지금 대운 ${current.ko}(${current.gz}) ${current.from}~${current.to}: 천간 ${current.stemTenGod}(${groupOf(current.stemTenGod)}), 지지 본기 ${current.branchMainTenGod}(${groupOf(current.branchMainTenGod)})`
    : base.luck
      ? `첫 대운이 시작되기 전이에요. ${base.luck.start}`
      : "태어난 시각을 몰라 연주나 월주가 하나로 정해지지 않아 대운은 계산하지 않았어요";
  const annual = base.annual;
  const annualLine = `올해 세운 ${annual.year} ${annual.ko}(${annual.gz}): 천간 ${annual.stemTenGod}(${groupOf(annual.stemTenGod)}), 지지 본기 ${annual.branchMainTenGod}(${groupOf(annual.branchMainTenGod)})`;
  const nextLine = `다가오는 해 세운 ${nextAnnual.year} ${nextAnnual.ko}(${nextAnnual.gz}), 입춘 무렵부터: 천간 ${nextAnnual.stemTenGod}(${groupOf(nextAnnual.stemTenGod)}), 지지 본기 ${nextAnnual.branchMainTenGod}(${groupOf(nextAnnual.branchMainTenGod)})`;

  /** Relations of the current 대운 and the two 세운 with the places this topic watches. */
  const placesOf = (names: GroupName[]): Placed[] =>
    names.flatMap((name) => group[name].visible.map((line) => {
      const [at = "", glyph = ""] = line.split(" ");
      return { glyph, at };
    }));
  const watch = (places: Placed[]) => {
    const s = places.filter((p) => p.at.endsWith("간"));
    const b = places.filter((p) => p.at.endsWith("지"));
    const meet = (stem: Placed, branch: Placed) => relationsTo(stem, branch, s, b).map(relationLine);
    return {
      luck: current ? meet({ glyph: current.gz.charAt(0), at: "대운 천간" }, { glyph: current.gz.charAt(1), at: "대운 지지" }) : [],
      annual: meet({ glyph: annual.gz.charAt(0), at: "세운 천간" }, { glyph: annual.gz.charAt(1), at: "세운 지지" }),
      next: meet(ns, nb),
    };
  };
  const dayPlaces: Placed[] = [{ glyph: chart.pillars.day.branch, at: "일지" }];
  const luckNotes = [luckLine, base.luck?.changeSoon ?? "", luckEdge ?? ""].filter(Boolean);

  let focus: SajuTopicFactSet["focus"];
  if (topic === "money") {
    const w = watch(placesOf(["재성"]));
    const wealthInLuck = current && group.재성.count === 0
      ? [groupOf(current.stemTenGod) === "재성" ? "원국 겉에 없는 재성이 지금 대운 천간에 드러나 있어요" : "", groupOf(current.branchMainTenGod) === "재성" ? "원국 겉에 없는 재성이 지금 대운 지지에 실려 있어요" : ""]
      : [];
    focus = {
      s2: [groupLine(group.재성), groupLine(group.식상), pairLine("식상", "재성"), hiddenLine(group.재성)].filter(Boolean),
      s3: [groupLine(group.비겁), groupLine(group.인성), `개수만 보면 비겁 ${group.비겁.count}개, 재성 ${group.재성.count}개`],
      s4: [...luckNotes, ...wealthInLuck, ...w.luck].filter(Boolean),
      s5: [annualLine, nextLine, ...w.annual, ...w.next],
    };
  } else if (topic === "career") {
    const monthPlaces: Placed[] = [{ glyph: chart.pillars.month.branch, at: "월지" }, { glyph: chart.pillars.day.branch, at: "일지" }];
    const w = watch(monthPlaces);
    const ambiguous = chart.ambiguous.find((a) => a.pillar === "month");
    const exam = situation === "exam";
    focus = {
      s2: exam
        ? [groupLine(group.인성), groupLine(group.관성), groupLine(group.식상), pairLine("관성", "식상")]
        : [groupLine(group.관성), groupLine(group.식상), pairLine("관성", "식상"), groupLine(group.인성)],
      s3: [
        `월주 ${monthPillar.ko}(${monthPillar.gz}): 천간 ${monthPillar.stem.glyph} ${monthPillar.stem.tenGod}, 지지 ${monthPillar.branch.glyph} 본기 ${monthPillar.branch.mainTenGod}, 지장간 ${monthPillar.hidden.map((h) => `${h.glyph} ${h.role} ${h.tenGod}`).join(", ")}, 12운성 ${monthPillar.branch.twelveStage}`,
        `겉에 가장 많은 묶음: ${mostGroups.join("·")} ${most}개`,
        ambiguous ? `태어난 시각에 따라 월주가 ${ambiguous.candidates.join(" 또는 ")} 가운데 하나예요` : "",
      ].filter(Boolean),
      s4: [...luckNotes, ...w.luck],
      s5: [annualLine, nextLine, ...w.annual, ...w.next],
    };
  } else if (topic === "love") {
    const w = watch(dayPlaces);
    focus = {
      s2: [dayBranchLine, ...dayRelations, `일간 ${base.dayMaster.display}: ${base.dayMaster.image}`, dayWindow?.sentence ?? ""].filter(Boolean),
      s3: [
        `다섯 묶음의 겉 개수(${basis}): ${items.map((g) => `${g.name} ${g.count}`).join(", ")}`,
        `가장 많은 기운: ${base.elements.most.join(", ")}${base.elements.missing.length ? ` · 겉에 없는 기운: ${base.elements.missing.join(", ")}` : ""}`,
      ],
      s4: [...luckNotes, ...w.luck],
      s5: [annualLine, nextLine, ...w.annual, ...w.next],
    };
  } else {
    const dayStemPlaces: Placed[] = [...dayPlaces, { glyph: day, at: "일간" }];
    const w = watch(dayStemPlaces);
    focus = {
      s2: [dayBranchLine, groupLine(group.인성), groupLine(group.식상), dayWindow?.sentence ?? ""].filter(Boolean),
      s3: [...(dayRelations.length ? dayRelations : ["일지·일간이 든 원국 관계는 따로 없어요"]), `겉에 가장 많은 묶음: ${mostGroups.join("·")} ${most}개`],
      s4: [...luckNotes, ...w.luck],
      s5: [annualLine, nextLine, ...w.annual, ...w.next],
    };
  }

  // ---- what the validator allows and expects ----
  const glyphs = new Set(base.allowed.glyphs);
  for (const g of gz) glyphs.add(g);
  HIDDEN_STEMS[nb.glyph as Branch].forEach((h) => glyphs.add(h.stem));
  const tenGods = new Set(base.allowed.tenGods);
  tenGods.add(nextAnnual.stemTenGod);
  HIDDEN_STEMS[nb.glyph as Branch].forEach((h) => tenGods.add(tenGod(day, h.stem)));
  const years = [...new Set([...base.allowed.years, year])].sort((a, b) => a - b);
  const yearMonths = new Set<string>();
  for (const c of cycles) [c.from, c.to].forEach((v) => v && yearMonths.add(v));
  if (current?.from) {
    const [fy = 0, fm = 0] = current.from.split("-").map(Number);
    yearMonths.add(`${fy + 5}-${pad(fm)}`);
  }
  if (starts) [starts.earliest, starts.latest].forEach((d) => yearMonths.add(ymOf(d)));

  const godNames = (names: GroupName[]) => names.flatMap((name) => [name, ...GROUP_GODS[name]]);
  const glyphsOf = (names: GroupName[]) => names.flatMap((name) => [...group[name].visible, ...group[name].hidden].map((line) => line.split(" ").at(-2)!));
  const zero = (names: GroupName[]) => names.filter((name) => group[name].count === 0);
  const relationWords = base.relations.filter(touchesDay).flatMap((r) => [r.type, `${r.type.replace(/\(.*$/, "")} 관계`]);
  const nextCycle = base.luck?.changeSoon ? cycles.find((c) => c.from !== null && c.from > nowYm) : undefined;
  const s2s3: Record<SajuTopicId, Pick<TopicAnchors, "s2" | "s3" | "zeroS2" | "zeroS3">> = {
    money: { s2: [...godNames(["재성", "식상"]), ...glyphsOf(["재성", "식상"])], s3: [...godNames(["비겁", "인성"]), ...glyphsOf(["비겁", "인성"])], zeroS2: zero(["재성", "식상"]), zeroS3: zero(["비겁", "인성"]) },
    career: {
      s2: [...godNames(["관성", "식상"]), ...glyphsOf(["관성", "식상"]), ...(situation === "exam" ? godNames(["인성"]) : [])],
      s3: ["월주", monthPillar.gz, monthPillar.ko, monthPillar.stem.glyph, monthPillar.branch.glyph],
      zeroS2: zero(situation === "exam" ? ["관성", "식상", "인성"] : ["관성", "식상"]),
      zeroS3: [],
    },
    love: { s2: ["일지", chart.pillars.day.branch, dayPillar.branch.display], s3: [...GROUP_NAMES], zeroS2: [], zeroS3: zero([...GROUP_NAMES]) },
    reunion: { s2: ["일지", chart.pillars.day.branch, dayPillar.branch.display], s3: [...relationWords, ...mostGroups], zeroS2: zero(["인성", "식상"]), zeroS3: [] },
  };
  const unique = (keys: string[]) => [...new Set(keys)];
  const picked = s2s3[topic];
  const anchors: TopicAnchors = {
    ...picked,
    s2: unique(picked.s2),
    s3: unique(picked.s3),
    s4: current ? [current.gz, current.ko] : base.luck ? ["첫 대운"] : ["대운"],
    s5: [[annual.gz, annual.ko], [nextAnnual.gz, nextAnnual.ko]],
    nextLuck: nextCycle ? [nextCycle.gz, nextCycle.ko] : null,
  };

  const chip = situation ? situationOf(topic, situation) : undefined;
  const { allowed: _baseAllowed, profile: _profile, schemaVersion: _version, monthly, ...rest } = base;
  const byTermName = (m: MonthPillar): TopicMonth => ({ ...m, term: m.term ? { name: m.term.name } : null });
  return {
    ...rest,
    schemaVersion: "saju-topic-facts/1",
    topic,
    ...(monthly ? { monthly: { current: byTermName(monthly.current), next: byTermName(monthly.next) } } : {}),
    limits: [...base.limits, TOPIC_LIMIT[topic]],
    groups: { basis, items },
    nextAnnual,
    luckEdge,
    dayWindow,
    focus,
    allowed: { glyphs: [...glyphs], tenGods: [...tenGods], stages: base.allowed.stages, years, yearMonths: [...yearMonths].sort(), anchors },
    ...(chip ? { situation: { id: chip.id, label: chip.label } } : {}),
    freshUntil: teaserFreshUntil(base, now),
  };
}
